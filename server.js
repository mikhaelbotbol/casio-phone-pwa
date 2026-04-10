const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Claude vision endpoint
app.post("/api/claude", async (req, res) => {
  const { image, question } = req.body;
  if (!image) return res.status(400).json({ error: "No image" });

  try {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: image },
          },
          {
            type: "text",
            text: question
              ? `${question}\n\nRepond dans la meme langue que la question. Sois concis.`
              : "Decris ce que tu vois. Sois tres concis.",
          },
        ],
      },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages,
    });

    const text = response.content[0].text;
    // Broadcast photo + answer to all PC clients
    io.emit("photo:result", { image, question: question || null, text });
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Socket.io - QCM
io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // PC sends a QCM question
  socket.on("qcm:send", (data) => {
    // data = { question, choices: ["A...", "B...", ...] }
    io.emit("qcm:receive", data);
  });

  // iPhone sends selected answer
  socket.on("qcm:answer", (data) => {
    // data = { index, text }
    io.emit("qcm:answered", data);
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
