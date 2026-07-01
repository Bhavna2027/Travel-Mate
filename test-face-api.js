const faceapi = require('@vladmandic/face-api');
const { Canvas, Image, ImageData, createCanvas, loadImage } = require('canvas');
const path = require('path');
require('@tensorflow/tfjs');

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

async function run() {
  const modelsPath = path.join(__dirname, 'src', 'models');
  console.log('Loading models from', modelsPath);
  try {
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
    console.log('Models loaded successfully');
  } catch (err) {
    console.error('Error loading models:', err);
  }
}
run();
