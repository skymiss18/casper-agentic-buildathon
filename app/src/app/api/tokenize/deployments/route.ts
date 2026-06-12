import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const DATA_FILE = path.join(process.cwd(), "data", "deployments.json");

function readDeployments(): Record<string, object> {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, object>;
  } catch {
    return {};
  }
}

function writeDeployments(data: Record<string, object>) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readDeployments());
}

export async function POST(req: Request) {
  const body = await req.json() as { id: string; deployment: object };
  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const deployments = readDeployments();
  deployments[body.id] = body.deployment;
  writeDeployments(deployments);
  return NextResponse.json({ ok: true });
}
