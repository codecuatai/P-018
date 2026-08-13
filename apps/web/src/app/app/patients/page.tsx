import { redirect } from "next/navigation";

export default function PatientsRedirect() {
  redirect("/app/profile?section=patients");
}
