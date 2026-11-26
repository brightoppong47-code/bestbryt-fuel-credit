import { expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AppErrorBoundary from "./AppErrorBoundary";
it("keeps healthy application content visible",()=>{
 render(<AppErrorBoundary><div>Dashboard ready</div></AppErrorBoundary>);
 expect(screen.getByText("Dashboard ready")).toBeInTheDocument(); cleanup();
});
it("shows recovery instructions when a startup query crashes without exposing error details",()=>{
 const spy=vi.spyOn(console,"error").mockImplementation(()=>{});
 const Broken=()=>{throw new Error("private backend diagnostic");};
 try {
  render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
  expect(screen.getByRole("alert")).toHaveTextContent("BESTBRYT could not load");
  expect(screen.getByRole("button",{name:"Reload app"})).toBeInTheDocument();
  expect(screen.queryByText("private backend diagnostic")).not.toBeInTheDocument();
 } finally {cleanup();spy.mockRestore();}
});
