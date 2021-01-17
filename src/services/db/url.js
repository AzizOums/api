const mongoose = require("mongoose");

const { Schema } = mongoose;
const { model } = mongoose;

const URLSchema = Schema({
  URL: String,
  shortURL: Number,
});

const URLModel = model("URL", URLSchema);

const addURL = async (myURL) => {
  try {
    const exists = await exist(myURL);
    if (exists) {
      console.log(`l'url: ${myURL}, exist déjà dans la base de données`);
      return false;
    }
    const all = await findAll();
    const docs = await URLModel.create({
      URL: myURL,
      shortURL: all.length,
    });
    console.log(`l'url: ${myURL} a été ajouté a la base de données!`);
    return docs;
  } catch (error) {
    throw new Error(
      `Erreur: l'url: ${myURL}, n'a pas été ajouté a la base de données !`
    );
  }
};

const findURL = async (myURL) => {
  try {
    const docs = await URLModel.find({ URL: myURL });
    return docs;
  } catch (error) {
    throw error;
  }
};

const findByShortURL = async (short) => {
  try {
    const docs = await URLModel.find({ shortURL: short });
    return docs;
  } catch (error) {
    throw error;
  }
};

const findAll = async () => {
  try {
    const docs = await URLModel.find();
    return docs;
  } catch (error) {
    throw error;
  }
};

const exist = async (myURL) => {
  try {
    const docs = await findURL(myURL);
    return docs.length !== 0;
  } catch (error) {
    throw error;
  }
};

const updateURL = async (oldURL, newURL) => {
  try {
    const exists = await exist(newURL);
    if (exists) {
      console.log(`l'url: ${newURL}, exist déjà dans la base de données`);
      return false;
    }
    const { nModified } = await URLModel.updateOne(
      { URL: oldURL },
      { URL: newURL }
    );
    return nModified === 1;
  } catch (error) {
    throw error;
  }
};

const deleteURL = async (myURL) => {
  try {
    const result = await URLModel.deleteOne({ URL: myURL });
    const { deletedCount } = result;
    return deletedCount > 0;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  addURL,
  findURL,
  findByShortURL,
  findAll,
  exist,
  updateURL,
  deleteURL,
};
