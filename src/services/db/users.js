const mongoose = require("mongoose");

const { Schema } = mongoose;
const { model } = mongoose;

const userSchema = Schema({
  username: String,
});

const userModel = model("users", userSchema);

const addUser = async (username) => {
  try {
    const exists = await exist(username);
    if (exists) {
      console.log(`le pseudo: ${username}, est déjà utilisé`);
      return false;
    }
    const docs = await userModel.create({
      username: username,
    });
    console.log(
      `l'utilisateur: ${username} a été ajouté a la base de données!`
    );
    return docs;
  } catch (error) {
    throw new Error(
      `Erreur: l'utilisateur: ${username}, n'a pas été ajouté a la base de données !`
    );
  }
};

const findUser = async (username) => {
  try {
    const docs = await userModel.find({ username: username });
    return docs;
  } catch (error) {
    throw error;
  }
};

const findUserById = async (id) => {
  try {
    const [{ username }] = await userModel.find({ _id: id });
    return username;
  } catch (error) {
    throw error;
  }
};

const idExist = async (id) => {
  try {
    const docs = await userModel.find({ _id: id });
    return docs !== null;
  } catch (error) {
    console.log(error);
    return false;
  }
};

const findAll = async () => {
  try {
    const docs = await userModel.find();
    return docs;
  } catch (error) {
    throw error;
  }
};

const exist = async (username) => {
  try {
    const docs = await userModel.find({ username: username });
    return docs.length !== 0;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  addUser,
  findUser,
  findUserById,
  idExist,
  findAll,
  exist,
};
