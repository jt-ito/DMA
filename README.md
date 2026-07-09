<div align="center">
  <h1>🐳 DMA (Docker Manager App)</h1>
  <p><strong>Your containers. Tamed, managed, securely protected, and beautifully visualized.</strong></p>
</div>

---

## 🚀 Welcome to DMA

Are you tired of typing `docker ps` and squinting at your terminal to figure out which randomly generated name belongs to your crucial database? Welcome to **DMA (Docker Manager App)**! We bring order to the chaos of containerization with a sleek, modern UI.

DMA takes the raw power of Docker and wraps it in a stunning Next.js interface, allowing you to manage your containers, images, and docker-compose deployments with the click of a button—no terminal required.

## ✨ Features

- **📊 Dashboard Magic**: Get a real-time overview of all your running containers, their resource usage, and statuses.
- **🛑 Start/Stop/Restart**: Complete lifecycle management at your fingertips.
- **📂 File System Explorer**: Peek inside your containers instantly.
- **🚀 Compose Deployments**: Easily spin up complex multi-container applications.
- **💅 Beautiful UI**: Because managing infrastructure doesn't have to look like a 90s hacking movie.

## 🛡️ Enterprise-Grade Security

DMA is built with a defense-in-depth architecture to keep your host machines and containers safe:

- **Strict Input Validation**: All incoming requests are strictly validated using `Zod` schemas to prevent payload manipulation.
- **Command Injection Prevention**: Subprocesses use argument arrays (`execFile`) and strict shell-escaping to completely neutralize command injection risks.
- **Session & CSRF Protection**: Uses stateless, signed JWT sessions (`jose`) with the Synchronizer Token Pattern (CSRF headers) to block cross-site attacks.
- **Step-Up Authentication**: High-risk actions (like the debug shell endpoint) require immediate password re-verification, yielding a short-lived token.
- **Durable Audit Logging**: Critical actions are durably logged to a local file with strict `0600` permissions and automated size/count-based log rotation.
- **Rate Limiting**: Protects mutating endpoints and login routes from brute force and denial of service attacks.
- **HTTP Security Headers**: Employs strict CSP, HSTS, and X-Frame-Options to lock down the browser surface.

## 🛠️ Built With

- [Next.js 16](https://nextjs.org/) (App Router & Proxy Middleware)
- [TypeScript](https://www.typescriptlang.org/)
- Docker Engine API & `node-ssh`
- `zod`, `jose`, `bcrypt`

## 🏃 Getting Started

To get DMA running locally, you only need Node.js. DMA can manage both **local Docker instances** (if Docker is installed on the same machine) and **remote Docker hosts** via secure SSH connections.

1. Clone this repository.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables:
   Copy the example environment file and fill in the required security secrets. **The app will refuse to start without a valid JWT_SECRET.**
   ```bash
   cp .env.example .env.local
   ```
   - Generate an `ADMIN_PASSWORD_HASH` using `bcrypt` (e.g., `node -e "console.log(require('bcrypt').hashSync('yourpassword', 10))"`).
   - Generate a `JWT_SECRET` (e.g., `openssl rand -base64 32`).

4. Start the development server (or build for production):
   ```bash
   npm run build
   npm start
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser, log in, and marvel at your containers!

---
> **Deployment Note:** The built-in rate limiter is in-memory. If deploying in a multi-instance or serverless environment, swap it for a distributed solution (like Redis).
