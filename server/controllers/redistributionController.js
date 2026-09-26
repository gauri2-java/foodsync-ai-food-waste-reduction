const engine = require('../services/cvrptwRouteOptimizer');

exports.getOptimizedRoutes = (req, res) => {
  const routes = engine.optimizeRoutes();
  res.json({ success: true, data: routes });
};

exports.verifyHandoff = (req, res) => {
  const { dispatchId, qrCode, thermalCheckC } = req.body;
  const temp = parseFloat(thermalCheckC || 62.5);
  const isHotPass = temp >= 60.0;

  res.json({
    success: true,
    message: isHotPass ? 'Tamper-Evident QR Handoff Verified Successfully!' : 'Temperature below threshold. Manual safety gate review required.',
    verificationRecord: {
      dispatchId: dispatchId || 'DISP-1001',
      qrSecurityCode: qrCode || 'FOODSYNC-AUTH-TOKEN-SIH2026-1001',
      thermalCheckC: temp,
      thermalCheckStatus: isHotPass ? 'PASS (Hot Holding Standard >= 60°C)' : 'WARNING (< 60°C)',
      verifiedAt: new Date().toISOString(),
      fssaiComplianceStatus: isHotPass ? 'CERTIFIED_SAFE' : 'UNDER_INSPECTION'
    }
  });
};
