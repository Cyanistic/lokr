import { useState } from "react";

export default function FileExplorer() {
    const [search, setSearch] = useState("");

    async function searchFiles() {
        
    }

    return (
        <div>
            <h1>Files</h1>
            <input
                type = "text"
                placeholder = "Search"
                value = {search}
                onChange = {e => setSearch(e.target.value)}
            />
            <button onClick = {searchFiles}>Search</button>
            <p>Placeholder for files page</p>
        </div>
    );
}