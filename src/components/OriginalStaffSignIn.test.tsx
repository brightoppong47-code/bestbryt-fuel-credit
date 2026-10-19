import {it,expect,vi,afterEach} from "vitest";
import {render,screen,cleanup} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {OriginalStaffSignIn} from "./OriginalStaffSignIn";
const auth=vi.hoisted(()=>({isAuthenticated:true,removeUser:vi.fn(),signin:vi.fn(),signout:vi.fn()}));
vi.mock("@usehercules/auth/react",()=>({useAuth:()=>auth}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("reopens original login instead of signing out when backend rejects an old session",async()=>{
 render(<OriginalStaffSignIn/>);
 await userEvent.click(screen.getByRole("button",{name:"Sign in again with original account"}));
 expect(auth.removeUser).toHaveBeenCalledOnce();expect(auth.signin).toHaveBeenCalledOnce();expect(auth.signout).not.toHaveBeenCalled();
 expect(auth.removeUser.mock.invocationCallOrder[0]).toBeLessThan(auth.signin.mock.invocationCallOrder[0]);
});
it("offers existing staff and admin the original login",async()=>{
 auth.isAuthenticated=false;
 render(<OriginalStaffSignIn/>);
 await userEvent.click(screen.getByRole("button",{name:"Original staff / admin login"}));
 expect(auth.signin).toHaveBeenCalledOnce();
});
