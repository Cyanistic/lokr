import { Link } from "react-router-dom";
import "./404Page.css";

export default function NotFound() {

    return(
        <div className="not-found-container">
            <h1 className="error-code">404</h1>
            <p className="error-message">Oops! The page you're looking for doesn't exist.</p>
            <Link to="/home" className="home-button">
                <button className="b1">Go Back</button>
            </Link>
        </div>

    )


}