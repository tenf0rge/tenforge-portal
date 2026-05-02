"""Multi-agent development harness — 4 personas discuss before implementing."""

import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_DIR = os.environ.get("PROJECT_DIR", str(Path(__file__).parent))


@dataclass
class Agent:
    name: str
    role: str
    personality: str


AGENTS = [
    Agent("Ken", "シニアエンジニア",
          "シンプルさ・実績ある技術・保守性を重視する。過剰設計に懐疑的で「本当に必要か？」を問い続ける。"),
    Agent("Revo", "テックリード",
          "最新技術とスケーラビリティを優先する。将来の拡張を見越した設計を提案し、野心的なアイデアを好む。"),
    Agent("Shu", "セキュリティ/QA",
          "リスクとエッジケースを常に考える慎重派。「何が壊れるか」「セキュリティは大丈夫か」を問う。"),
    Agent("Yu", "PM/UX",
          "ユーザー目線を代弁する。「それで何が嬉しいか」「最もシンプルな解決策は何か」を問い続ける。"),
]


async def ask_agent(agent: Agent, prompt: str) -> str:
    full_prompt = (
        f"あなたは{agent.name}（{agent.role}）として発言してください。\n"
        f"性格: {agent.personality}\n"
        f"日本語で簡潔に（3点以内）意見を述べてください。\n\n"
        f"{prompt}"
    )
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", full_prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=PROJECT_DIR,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        process.kill()
        return f"[{agent.name}: タイムアウト (120秒)]"
    return stdout.decode().strip()


async def synthesize(task: str, opinions: str, debate: str) -> str:
    prompt = (
        f"タスク: {task}\n\n"
        f"=== 初期意見 ===\n{opinions}\n\n"
        f"=== 議論 ===\n{debate}\n\n"
        "上記の議論を踏まえ、最終的な実装方針を決定してください。"
        "合意点・懸念点・実装ステップを明確にまとめてください。"
    )
    process = await asyncio.create_subprocess_exec(
        "claude", "--print", "--dangerously-skip-permissions", prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=PROJECT_DIR,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        process.kill()
        return "[合意フェーズ: タイムアウト (120秒)]"
    return stdout.decode().strip()


async def run_discussion(task: str, callback=None) -> str:
    async def emit(text: str):
        print(text)
        if callback:
            await callback(text)

    await emit(f"## タスク\n{task}\n")
    await emit("---\n### Phase 1: 初期意見（並列）")

    initial = await asyncio.gather(*[
        ask_agent(a, f"以下のタスクについて意見を述べてください:\n{task}")
        for a in AGENTS
    ])

    opinions_text = ""
    for agent, result in zip(AGENTS, initial):
        line = f"**{agent.name}（{agent.role}）**\n{result}"
        opinions_text += line + "\n\n"
        await emit(line)

    await emit("---\n### Phase 2: 議論")

    debate_prompt = (
        f"タスク: {task}\n\n各メンバーの初期意見:\n{opinions_text}\n"
        "上記を踏まえ、あなたの立場から反論・同意・補足を述べてください。"
    )
    debate = await asyncio.gather(*[
        ask_agent(a, debate_prompt) for a in AGENTS
    ])

    debate_text = ""
    for agent, result in zip(AGENTS, debate):
        line = f"**{agent.name}**: {result}"
        debate_text += line + "\n\n"
        await emit(line)

    await emit("---\n### Phase 3: 合意・実装方針")
    result = await synthesize(task, opinions_text, debate_text)
    await emit(result)

    return result


if __name__ == "__main__":
    task = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "新機能を提案してください"
    asyncio.run(run_discussion(task))
