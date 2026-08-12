import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const backendOrigin = process.env.BACKEND_URL?.trim() || "http://127.0.0.1:8000";
  const apiKey = process.env.BACKEND_API_KEY?.trim() || "";
  
  try {
    const body = await request.json();
    console.log("Sending to backend:", `${backendOrigin}/api/v1/farmers/register`);
    const response = await fetch(`${backendOrigin}/api/v1/farmers/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    console.log("Backend response:", response.status, text);
    
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      data = { message: text };
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Fetch error:", error.message);
    return NextResponse.json(
      { error: { message: `Internal proxy error: ${error.message}` } },
      { status: 500 }
    );
  }
}
