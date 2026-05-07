export default function ErrorBoundaryTestPage() {
  throw new Error("Intentional error from /__boundary-test");
  return null;
}
