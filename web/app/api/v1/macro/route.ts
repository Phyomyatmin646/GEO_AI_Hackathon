import { NextResponse } from "next/server";
import worldBankSnapshot from "../../../../data/official/world_bank_myanmar.json";

const payload = {
  dataContract: "official_world_bank_myanmar_indicators_v1",
  verificationStatus: "official-source-snapshot",
  ...worldBankSnapshot,
};

export async function GET() {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "X-Data-Contract": payload.dataContract,
      "X-Data-Verification": payload.verificationStatus,
    },
  });
}
