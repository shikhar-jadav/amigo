from __future__ import annotations

import hashlib
import io
import json
import asyncio
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from talos_backend.app import create_app
from talos_backend.hub import HubRegistry, _inspect_archive
from talos_backend.plugins import PluginRegistry


def _skill_archive(content: str = "# Example skill\n") -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("example/SKILL.md", content)
        archive.writestr("example/references.md", "Supporting notes\n")
    return output.getvalue()


def test_hub_registry_publish_moderate_search_download_and_immutable_versions(tmp_path):
    registry = HubRegistry(tmp_path / "hub.sqlite3")
    artifact = _skill_archive()
    pending = registry.publish(kind="skill", slug="example-skill", name="Example skill", description="A skill",
                               publisher="alice", version="1.0.0", tags=["writing", " writing "], artifact=artifact)
    assert pending["status"] == "pending"
    assert registry.list_packages()["count"] == 0
    queued = registry.moderation_queue()
    assert len(queued) == 1 and queued[0]["version"] == "1.0.0"
    registry.moderate(pending["id"], "1.0.0", "publish", "moderator")
    assert registry.list_packages(query="example")["packages"][0]["tags"] == ["writing"]

    new_artifact = _skill_archive("# Example skill v2\n")
    next_release = registry.publish(kind="skill", slug="example-skill", name="Example skill", description="Updated",
                                    publisher="alice", version="2.0.0", tags=["writing"], artifact=new_artifact)
    assert next_release["status"] == "pending"
    assert registry.get_package("skill", "example-skill")["version"] == "1.0.0"
    registry.moderate(next_release["id"], "2.0.0", "publish", "moderator")
    assert registry.get_package("skill", "example-skill")["version"] == "2.0.0"
    downloaded = registry.download("skill", "example-skill")
    assert downloaded["artifact"] == new_artifact
    assert downloaded["digest"] == hashlib.sha256(new_artifact).hexdigest()
    with pytest.raises(ValueError, match="immutable"):
        registry.publish(kind="skill", slug="example-skill", name="Example skill", description="", publisher="alice",
                         version="2.0.0", tags=[], artifact=_skill_archive("changed"))
    with pytest.raises(PermissionError):
        registry.publish(kind="skill", slug="example-skill", name="Example skill", description="", publisher="mallory",
                         version="3.0.0", tags=[], artifact=_skill_archive())


def test_hub_rejects_traversal_and_plugin_entrypoint_escape():
    traversal = io.BytesIO()
    with zipfile.ZipFile(traversal, "w") as archive:
        archive.writestr("../SKILL.md", "bad")
    with pytest.raises(ValueError, match="Unsafe archive path"):
        _inspect_archive("skill", "1.0.0", traversal.getvalue())

    escaped = io.BytesIO()
    with zipfile.ZipFile(escaped, "w") as archive:
        archive.writestr("pkg/amigo.plugin.json", json.dumps({"id": "safe", "version": "1.0.0", "kind": "tool", "entrypoint": "../outside.py"}))
        archive.writestr("pkg/outside.py", "print('unsafe')")
    with pytest.raises(ValueError, match="entrypoint"):
        _inspect_archive("plugin", "1.0.0", escaped.getvalue())


def test_hub_http_publish_requires_token_and_moderation_then_serves_digest(tmp_path, monkeypatch):
    monkeypatch.setenv("AMIGOHUB_PUBLISH_TOKEN", "publisher-token")
    monkeypatch.setenv("AMIGOHUB_MODERATOR_TOKEN", "moderator-token")
    app = create_app(tmp_path)
    artifact = _skill_archive()
    with TestClient(app) as client:
        unauthenticated = client.post("/v1/hub/packages", data={"kind": "skill", "slug": "unauthenticated", "name": "Example", "version": "1.0.0"},
                                      files={"artifact": ("skill.zip", artifact, "application/zip")})
        assert unauthenticated.status_code == 401
        response = client.post("/v1/hub/packages", headers={"Authorization": "Bearer publisher-token", "X-Amigo-Publisher": "alice"},
                               data={"kind": "skill", "slug": "example-skill", "name": "Example skill", "version": "1.0.0", "tags": '["docs"]'},
                               files={"artifact": ("skill.zip", artifact, "application/zip")})
        assert response.status_code == 200, response.text
        package = response.json()["package"]
        assert client.get("/v1/hub/packages").json()["count"] == 0
        queue = client.get("/v1/hub/moderation/queue", headers={"Authorization": "Bearer moderator-token"})
        assert queue.status_code == 200 and len(queue.json()["items"]) == 1
        moderated = client.post(f"/v1/hub/moderation/{package['id']}/1.0.0", headers={"Authorization": "Bearer moderator-token"},
                                json={"decision": "publish"})
        assert moderated.status_code == 200
        download = client.get("/v1/hub/packages/skill/example-skill/download")
        assert download.content == artifact
        assert download.headers["x-content-sha256"] == hashlib.sha256(artifact).hexdigest()


def test_in_memory_app_does_not_create_hub_database(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    app = create_app(__import__("pathlib").Path(":memory:"))
    assert app.state.hub is None
    with TestClient(app) as client:
        assert client.get("/v1/hub/packages").status_code == 503
    assert not (tmp_path / ":memory:").exists()


def test_hub_cli_installs_downloaded_skill_with_provenance(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from talos_backend import hub_cli
    artifact = _skill_archive()
    digest = hashlib.sha256(artifact).hexdigest()
    monkeypatch.setattr(hub_cli, "_request", lambda *_args, **_kwargs: (artifact, {"x-content-sha256": digest, "content-disposition": 'attachment; filename="example-skill-1.0.0.zip"'}))
    args = SimpleNamespace(kind="skill", slug="example-skill", version=None, state_dir=tmp_path, yes=True)
    result = hub_cli._install(args, "http://localhost")
    installed = tmp_path / "skills" / "example-skill"
    assert result["installed"] is True and result["version"] == "1.0.0"
    assert (installed / "SKILL.md").is_file()
    origin = json.loads((installed / ".origin.json").read_text("utf-8"))
    assert origin["source"] == "amigohub://skill/example-skill@1.0.0"
    assert origin["sha256"] == digest


def test_plugin_template_can_publish_and_install_on_another_machine(tmp_path, monkeypatch, capsys):
    import sys
    from talos_backend import cli, hub_cli

    monkeypatch.setenv("AMIGOHUB_PUBLISH_TOKEN", "publisher-token")
    monkeypatch.setenv("AMIGOHUB_MODERATOR_TOKEN", "moderator-token")
    app = create_app(tmp_path / "hub-server")
    builder_state = tmp_path / "builder"
    monkeypatch.setenv("TALOS_STATE_DIR", str(builder_state))
    monkeypatch.setattr(sys, "argv", ["amigo", "plugin", "init", "stranger-plugin"])
    cli.main()
    plugin_path = Path(json.loads(capsys.readouterr().out)["path"])
    manifest = json.loads((plugin_path / "amigo.plugin.json").read_text("utf-8"))
    assert manifest["id"] == "stranger-plugin"

    archive_path = tmp_path / "stranger-plugin.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in plugin_path.rglob("*"):
            if path.is_file():
                archive.write(path, f"{plugin_path.name}/{path.relative_to(plugin_path).as_posix()}")

    with TestClient(app) as client:
        def local_hub_request(url, *, token=None, data=None, content_type=None, extra_headers=None):
            headers = dict(extra_headers or {})
            if token:
                headers["Authorization"] = token
            if content_type:
                headers["Content-Type"] = content_type
            response = client.request("POST" if data is not None else "GET", url, content=data, headers=headers)
            assert response.status_code < 400, response.text
            return response.content, {key.lower(): value for key, value in response.headers.items()}

        monkeypatch.setattr(hub_cli, "_request", local_hub_request)
        monkeypatch.setattr(sys, "argv", [
            "amigohub", "--url", "http://amigo.test", "package", "publish", "plugin", str(archive_path),
            "--slug", "stranger-plugin", "--name", "Stranger Plugin", "--version", manifest["version"],
            "--publisher", "alice",
        ])
        hub_cli.main()
        published = json.loads(capsys.readouterr().out)
        package = published["package"]
        assert package["status"] == "pending"

        monkeypatch.setattr(sys, "argv", [
            "amigohub", "--url", "http://amigo.test", "package", "moderate",
            package["id"], manifest["version"], "publish",
        ])
        hub_cli.main()
        assert json.loads(capsys.readouterr().out)["status"] == "published"

        second_machine = tmp_path / "second-machine"
        monkeypatch.setattr(sys, "argv", [
            "amigohub", "--url", "http://amigo.test", "install", "plugin", "stranger-plugin",
            "--state-dir", str(second_machine),
        ])
        hub_cli.main()
        installed = json.loads(capsys.readouterr().out)

    plugin_dir = second_machine / "plugins" / "stranger-plugin"
    assert installed["installed"] is True
    assert (plugin_dir / "amigo.plugin.json").is_file()
    origin = json.loads((plugin_dir / ".origin.json").read_text("utf-8"))
    assert origin["source"] == "amigohub://plugin/stranger-plugin@0.1.0"
    registry = PluginRegistry(second_machine / "plugins")
    assert registry.list()[0]["enabled"] is False
    registry.set_enabled("stranger-plugin", True)
    result = asyncio.run(registry.invoke_isolated("stranger-plugin", "smoke", {}))
    assert result == {"ok": True, "method": "smoke"}
