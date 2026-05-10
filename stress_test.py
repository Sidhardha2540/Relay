import asyncio
import httpx
import random
import sys

BASE = "http://127.0.0.1:49152"

async def agent_worker(client, agent_id, iterations=5):
    headers = {"X-Coord-Agent-Id": agent_id}
    
    # 1. Register
    await client.post(f"{BASE}/api/register", json={
        "agent_id": agent_id,
        "type": "agent",
        "task": f"Stress testing load",
        "scope": [f"stress/{agent_id}/"],
        "mode": "exclusive",
        "limits": {"max_calls_per_min": 1000, "max_state_size_kb": 10000}
    }, headers=headers)
    
    for i in range(iterations):
        scope = f"stress/{agent_id}/task_{i}"
        
        # 2. Claim Intent
        await client.post(f"{BASE}/api/intents", json={
            "scope": scope,
            "action": f"Processing heavy payload {i}",
            "ttl_minutes": 1
        }, headers=headers)
        
        await asyncio.sleep(random.uniform(0.5, 2.0))
        
        # 3. Share Discovery
        await client.post(f"{BASE}/api/discoveries", json={
            "scope": scope,
            "summary": f"Found out that processing chunk {i} takes {random.randint(10, 50)}ms",
            "confidence": "verified"
        }, headers=headers)
        
        await asyncio.sleep(random.uniform(0.2, 1.0))
        
        # 4. Commit Decision
        await client.post(f"{BASE}/api/decisions", json={
            "scope": scope,
            "key": "chunk_status",
            "value": "processed",
            "rationale": "Successfully passed verification."
        }, headers=headers)
        
        await asyncio.sleep(random.uniform(0.5, 2.0))

async def main(num_agents):
    print(f"Starting load test with {num_agents} concurrent agents...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [agent_worker(client, f"bot-{i}", iterations=5) for i in range(num_agents)]
        await asyncio.gather(*tasks)
    print("Load test complete!")

if __name__ == "__main__":
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    asyncio.run(main(num))
