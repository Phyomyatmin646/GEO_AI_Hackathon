import type { Metadata } from "next";
import { PilotDashboard } from "./components/PilotDashboard";

export const metadata: Metadata = {
  title: "မြေသိ | Myanmar Crop Intelligence",
  description:
    "Explainable crop screening for Myanmar using real satellite, climate, soil and terrain evidence.",
};

export default function Home() {
  return <PilotDashboard />;
}
