import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return NextResponse.json({
    status: "pending",
    message: "Ticket processing not implemented yet",
  });
}
