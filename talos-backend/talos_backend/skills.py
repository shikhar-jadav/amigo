from pathlib import Path
import json
import shutil


def discover_skills(directories: list[Path]) -> list[dict[str, str]]:
    skills: dict[str, dict[str, str]] = {}
    for directory in directories:
        if not directory.exists():
            continue
        for file in sorted(directory.glob("*/SKILL.md")):
            name = file.parent.name
            content = file.read_text(encoding="utf-8")
            first_line = next((line.lstrip("# ").strip() for line in content.splitlines() if line.strip()), name)
            skills[name] = {"name": name, "title": first_line, "path": str(file), "content": content}
    return list(skills.values())


def eligible_skills(directories: list[Path], *, os_name: str | None = None, bins: set[str] | None = None) -> list[dict[str, str]]:
    import os
    import shutil
    current_os = os_name or os.name
    available_bins = bins
    result = []
    for skill in discover_skills(directories):
        text = skill["content"]
        # Small frontmatter subset used by workspace skill packs.
        requires_os: list[str] = []
        requires_bins: list[str] = []
        in_frontmatter = False
        for line in text.splitlines():
            if line.strip() == "---":
                in_frontmatter = not in_frontmatter
                continue
            if in_frontmatter and line.startswith("os:"):
                requires_os = [v.strip() for v in line.partition(":")[2].strip(" []").split(",") if v.strip()]
            if in_frontmatter and line.startswith("bins:"):
                requires_bins = [v.strip() for v in line.partition(":")[2].strip(" []").split(",") if v.strip()]
        detected = available_bins if available_bins is not None else {name for name in requires_bins if shutil.which(name)}
        if requires_os and current_os not in requires_os:
            continue
        if not set(requires_bins).issubset(detected):
            continue
        result.append(skill)
    return result


def install_skill(source: Path, destination: Path, slug: str | None = None) -> dict[str, str]:
    source = source.resolve()
    skill_file = source / "SKILL.md" if source.is_dir() else source
    if skill_file.name.lower() != "skill.md" or not skill_file.is_file():
        raise ValueError("Skill source must contain SKILL.md")
    body = skill_file.read_text(encoding="utf-8")
    name = slug or skill_file.parent.name
    if not name.replace("-", "").replace("_", "").isalnum():
        raise ValueError("Skill slug may contain only letters, numbers, hyphens, and underscores")
    target = destination / name
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy2(skill_file, target / "SKILL.md")
    if skill_file.parent.is_dir():
        for child in skill_file.parent.iterdir():
            if child.name.lower() != "skill.md" and (child.is_file() or child.is_dir()):
                dest = target / child.name
                shutil.copytree(child, dest, dirs_exist_ok=True) if child.is_dir() else shutil.copy2(child, dest)
    (target / ".origin.json").write_text(json.dumps({"source": str(source), "installedAt": __import__("time").time()}, indent=2), encoding="utf-8")
    return {"name": name, "path": str(target / "SKILL.md"), "description": next((line.partition(":")[2].strip() for line in body.splitlines() if line.startswith("description:")), "")}


def skill_card(path: Path) -> dict[str, str]:
    content = (path / "SKILL.md" if path.is_dir() else path).read_text(encoding="utf-8")
    return {"sha256": __import__("hashlib").sha256(content.encode()).hexdigest(), "name": (path.parent.name if path.is_file() else path.name), "warning": "Review skill instructions before enabling; skills are prompt content."}
