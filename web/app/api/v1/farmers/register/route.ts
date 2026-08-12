import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const backendOrigin = process.env.BACKEND_URL?.trim() || "http://127.0.0.1:8000";
  const apiKey = process.env.BACKEND_API_KEY?.trim() || "";
  
  try {
    const body = await request.json();
    const response = await fetch(`${backendOrigin}/api/v1/farmers/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: "Internal proxy error" } },
      { status: 500 }
    );
  }
}
