const {
  getDeviceSummaries,
  getDeviceMapSummaries,
  getDeviceMapRoutes,
  getDeviceDetails
} = require('../services/deviceManagerService');

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

exports.listDevices = async (req, res) => {
  try {
    const devices = await getDeviceSummaries();

    return res.json({
      success: true,
      count: devices.length,
      data: devices
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load devices.');
  }
};

exports.listDevicesForMap = async (req, res) => {
  try {
    const devices = await getDeviceMapSummaries();

    return res.json({
      success: true,
      count: devices.length,
      data: devices
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load device map data.');
  }
};

exports.listDeviceMapRoutes = async (req, res) => {
  try {
    const routes = await getDeviceMapRoutes();

    return res.json({
      success: true,
      count: routes.length,
      data: routes
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load device map routes.');
  }
};

exports.getDeviceDetails = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device id.'
      });
    }

    const device = await getDeviceDetails(id);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found.'
      });
    }

    return res.json({
      success: true,
      data: device
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load device details.');
  }
};
