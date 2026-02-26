import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    const body = req.body;
    console.log("Webhook received:", body);

    res.status(200).json({
      status: "success",
      message: "Webhook received",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      timestamp: new Date().toISOString(),
    });
  }
}
