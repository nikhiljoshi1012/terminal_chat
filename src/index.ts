import { ensureDirs } from "./store.ts"
import { App } from "./app.ts"

ensureDirs()
const app = await App.create()
app.run()
export {}