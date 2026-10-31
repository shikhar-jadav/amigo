import uvicorn


def main() -> None:
    uvicorn.run("talos_backend.app:app", host="127.0.0.1", port=18800, http="h11")


if __name__ == "__main__":
    main()
