const fs = require("fs");
const axios = require("axios");

const url = "https://jsonplaceholder.typicode.com/todos";
const path = `${__dirname}/files/data.json`;

// const path = "/home/aziz/nodejs/shorturl_api/src/controller/files/data.json";

/*
const get = async (req, res, next) => {
  try {
    const { data } = await axios.get(url);
    write(path, JSON.stringify(data));
    read(path, (err, readData) => {
      if (err) throw err;
      const jsonData = JSON.parse(readData);
      if (JSON.stringify(data) === JSON.stringify(jsonData))
        console.log("same data");
      else console.log("not the same data");
    });

    res.status(200).send("success");
  } catch (err) {
    console.log(err);
    return next({ status: 500, message: "server error" });
  }
};
*/

//callbacks
const write = (path, data) => {
  try {
    fs.writeFile(path, data, (err) => {
      if (err) throw err;
    });
    console.log(`data successfully written to the file: ${path}`);
  } catch (error) {
    throw error;
  }
};

const read = (path, callback) => {
  try {
    fs.readFile(path, callback);
  } catch (error) {
    throw error;
  }
};

//promises
const pwrite = (path, data) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, (err) => {
      if (err) reject(err);
      else resolve(0);
    });
  });
};

const pread = (path, data) => {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
};

const get = async (req, res, next) => {
  try {
    const { data } = await axios.get(url);
    const written = await pwrite(path, JSON.stringify(data));
    console.log(written);
    const readData = await pread(path);
    const jsonData = JSON.parse(readData);
    if (JSON.stringify(jsonData) === JSON.stringify(data))
      console.log("same data");
    else console.log("not same data");
    return res.status(200).send("success");
  } catch (err) {
    console.log(err);
    return next({ status: 500, message: "server error" });
  }
};

module.exports = {
  get,
};
