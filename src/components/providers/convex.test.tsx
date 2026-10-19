import {it,expect,vi,afterEach} from "vitest";
import {render,screen,cleanup} from "@testing-library/react";
import type {ReactNode} from "react";
import {ConvexProvider} from "./convex";
const session=vi.hoisted(()=>({isLoading:false,isAuthenticated:false}));
vi.mock("@convex-dev/auth/react",()=>({useConvexAuth:()=>session,ConvexAuthProvider:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock("convex/react",()=>({ConvexReactClient:class {},ConvexProviderWithAuth:({children}:{children:ReactNode})=><div data-testid="password-provider">{children}</div>}));
vi.mock("@usehercules/auth/convex-react",()=>({ConvexProviderWithHerculesAuth:({children}:{children:ReactNode})=><div data-testid="original-provider">{children}</div>}));
afterEach(()=>cleanup());
it("keeps existing users on the original provider",()=>{
 render(<ConvexProvider>App content</ConvexProvider>);
 expect(screen.getByTestId("original-provider")).toHaveTextContent("App content");
 expect(screen.queryByTestId("password-provider")).toBeNull();
});
it("uses password auth only for a password session",()=>{
 session.isAuthenticated=true;
 render(<ConvexProvider>App content</ConvexProvider>);
 expect(screen.getByTestId("password-provider")).toHaveTextContent("App content");
 expect(screen.queryByTestId("original-provider")).toBeNull();
});
