import Cookies from 'js-cookie';

/* Whether the user is authenticated
 * */
export function isAuthenticated(): boolean {
    const res = Cookies.get("authenticated");
    console.log(document.cookie);
    return Boolean(res);
}

/* Logout from the backend. Returns a boolean indicating whether the logout was successful
 * */
export async function logout(): Promise<boolean> {
    const res = await fetch("/api/logout", { method: "POST" });
    return res.ok;
}
