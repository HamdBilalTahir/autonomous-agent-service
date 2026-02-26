import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Webhook received:", body);

    return NextResponse.json({
      status: "success",
      message: "Webhook received",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Internal Server Error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
