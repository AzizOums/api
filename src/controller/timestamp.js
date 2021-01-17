const getTimestamp = (req, res, next) => {
  const data = {
    unix: new Date().valueOf(),
    utc: new Date().toUTCString(),
  };
  try {
    res.status(200).send(data);
  } catch (err) {
    next({ status: 500, message: "server error" });
  }
};

const getParamTimestamp = (req, res) => {
  try {
    const { param: str } = req.params;
    const date = /\d{5,}$/.test(str) ? new Date(parseInt(str)) : new Date(str);
    const data =
      date.toUTCString() !== "Invalid Date"
        ? {
            unix: date.valueOf(),
            utc: date.toUTCString(),
          }
        : {
            Error: "Invalide Date!",
          };
    return res.status(200).send(data);
  } catch (err) {
    return next({ status: 500, message: "server error" });
  }
};

module.exports = {
  getTimestamp,
  getParamTimestamp,
};
