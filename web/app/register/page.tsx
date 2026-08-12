import type { Metadata } from "next";

import { RegisterExperience } from "./RegisterExperience";

export const metadata: Metadata = {
  title: "Register | Myanmar Agriculture Intelligence",
  description: "Create a profile for Myanmar Agriculture Intelligence.",
};

export default function RegisterPage() {
  return <RegisterExperience />;
}
