import Cookies from 'js-cookie';
import { PublicUser } from './types';

/* Whether the user is authenticated
 * */
export function isAuthenticated(): boolean {
    const res = Cookies.get("authenticated");
    return Boolean(res);
}

/* Logout from the backend. Returns a boolean indicating whether the logout was successful
 * */
export async function logout(): Promise<boolean> {
    const res = await fetch("/api/logout", { method: "POST" });
    return res.ok;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmail(email: string) {
    return EMAIL_REGEX.test(email);
};

// Fetch usernames from the API
export async function fetchUsernames(query: string, limit: number, offset: number): Promise<PublicUser> {
    const response = await fetch(`http://localhost:6969/api/users/search/${query}?limit=${limit}&offset=${offset}`);
    if (!response.ok) throw new Error(`Failed to fetch usernames: ${await response.text()}`);
    return await response.json();
};
