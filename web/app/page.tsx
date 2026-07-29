import type { Metadata } from "next";
import { PilotDashboard } from "./components/PilotDashboard";

export const metadata: Metadata = {
  title: "စိုက်ပျိုးမိတ်ဆွေ | Myanmar Agriculture Intelligence",
  description:
    "မြန်မာနိုင်ငံအတွက် official-source agriculture, climate and economic evidence.",
};

export default function Home() {
  return <PilotDashboard />;
}
