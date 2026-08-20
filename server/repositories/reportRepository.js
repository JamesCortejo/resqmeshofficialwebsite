module.exports = {
  ...require('./reports/incidentReportRepository'),
  ...require('./reports/rescueTeamReportRepository'),
  ...require('./reports/meshDeviceReportRepository'),
  ...require('./reports/onlineCommunicationReportRepository'),
  ...require('./reports/reportExportRepository')
};
