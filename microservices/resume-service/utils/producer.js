const { Kafka } = require("kafkajs");
const dotenv = require("dotenv");

dotenv.config();

const kafka = new Kafka({
  clientId: "resume-service",
  brokers: process.env.KAFKA_BROKER.split(",").map((broker) => broker.trim()),
});

const producer = kafka.producer();

// const produceMessage = async (message, topic, requestId) => {
//   await producer.connect();

//   console.log('producer', requestId, 16)
//   await producer.send({
//     topic: topic,
//     messages: [{ key: requestId, value: JSON.stringify(message) }]
//   });
// };

const produceMessage = async (message, topic, requestId) => {
  await producer.connect();

  console.log("Producing message:", requestId);
  
  await producer.send({
    topic: topic,
    messages: [{ key: String(requestId), value: JSON.stringify(message) }]
  });
};

module.exports = { produceMessage };
