import ReactDOM from "react-dom/client"
import { App } from "./App"

import "./styles.css"

const el = document.getElementById("app")!
if (!el.innerHTML) ReactDOM.createRoot(el).render(<App />)
