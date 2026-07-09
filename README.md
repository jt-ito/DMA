<div align="center">
  <h1>🐳 DMA (Docker Manager App)</h1>
  <p><strong>Your containers. Tamed, managed, and beautifully visualized.</strong></p>
</div>

---

## 🚀 Welcome to DMA

Are you tired of typing `docker ps` and squinting at your terminal to figure out which randomly generated name belongs to your crucial database? Welcome to **DMA (Docker Manager App)**! We bring order to the chaos of containerization with a sleek, modern UI.

DMA takes the raw power of Docker and wraps it in a stunning Next.js interface, allowing you to manage your containers, images, and docker-compose deployments with the click of a button—no terminal required (mostly).

## ✨ Features

- **📊 Dashboard Magic**: Get a real-time overview of all your running containers, their resource usage, and statuses.
- **🛑 Start/Stop/Restart**: Complete lifecycle management at your fingertips.
- **📂 File System Explorer**: Peek inside your containers without having to `docker exec -it <container> /bin/bash`.
- **🚀 Compose Deployments**: Easily spin up complex multi-container applications.
- **💅 Beautiful UI**: Because managing infrastructure doesn't have to look like a 90s hacking movie.

## 🛠️ Built With

- [Next.js](https://nextjs.org/) - React Framework for the Web
- [TypeScript](https://www.typescriptlang.org/) - Because we like knowing what our variables are
- Docker Engine API - The magic behind the scenes

## 🏃 Getting Started

To get DMA running locally, make sure you have Docker installed and running on your machine.

1. Clone this repository (you are here!).
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser and marvel at your containers!

---

*Note: The `dockermanager.exe` binary is strictly kept out of version control, because sharing compiled binaries in a repo is like sharing a toothbrush—just don't do it.*
