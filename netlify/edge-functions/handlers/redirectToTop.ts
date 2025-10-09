import { permanentRedirect } from "https://ghuc.cc/worker-tools/response-creators";

export function redirectToTop() {
  return permanentRedirect("/top/1");
}
