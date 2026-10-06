"""OpenSandbox client smoke test for Termux/Linux once a server is available."""

import asyncio
import os
import sys

from opensandbox import Sandbox
from opensandbox.config import ConnectionConfig


def required_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise SystemExit(f"Set one of these environment variables: {', '.join(names)}")


async def main() -> None:
    domain = required_env("SANDBOX_SERVER_DOMAIN", "OPEN_SANDBOX_DOMAIN")
    api_key = required_env(
        "SANDBOX_API_KEY",
        "OPEN_SANDBOX_API_KEY",
        "OPENSANDBOX_API_KEY",
    )
    protocol = os.environ.get("SANDBOX_SERVER_PROTOCOL", "https").lower()
    if protocol not in {"http", "https"}:
        raise SystemExit("SANDBOX_SERVER_PROTOCOL must be http or https")

    config = ConnectionConfig(
        domain=domain,
        protocol=protocol,
        api_key=api_key,
        use_server_proxy=True,
    )

    sandbox = None
    try:
        sandbox = await Sandbox.create(
            "python:3.12",
            connection_config=config,
        )
        result = await sandbox.commands.run("echo hello from sandbox")

        for log in result.logs.stdout or []:
            print(log.text, end="" if log.text.endswith("\n") else "\n")
        for log in result.logs.stderr or []:
            print(log.text, file=sys.stderr, end="" if log.text.endswith("\n") else "\n")

        if result.error:
            raise RuntimeError("Sandbox command returned an error")
    finally:
        if sandbox is not None:
            await sandbox.destroy()


if __name__ == "__main__":
    asyncio.run(main())
