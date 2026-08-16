import { redirect } from "next/navigation";

export default function AddressesRedirect() {
  redirect("/app/profile?section=addresses");
}
