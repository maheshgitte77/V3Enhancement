const app = require("./server");
const { fork } = require("child_process");
const path = require("path");

const PORT = process.env.PORT || 6001;

// Start Express Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Workers List
// const workers = ["questionsWorker.js", "usersWorker.js", "notificationsWorker.js"];
const workers = ["questionsWorker.js"];

workers.forEach((worker) => {
  fork(path.join(__dirname, "workers", worker));
});
