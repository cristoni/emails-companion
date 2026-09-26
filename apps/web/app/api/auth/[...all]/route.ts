import { toNextJsHandler } from "better-auth/next-js";
import { ottieniAuth } from "@/lib/server/auth";

export async function GET(richiesta: Request) {
  return toNextJsHandler(await ottieniAuth()).GET(richiesta);
}

export async function POST(richiesta: Request) {
  return toNextJsHandler(await ottieniAuth()).POST(richiesta);
}
