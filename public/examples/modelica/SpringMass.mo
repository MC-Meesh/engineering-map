within ;
model SpringMass "Undamped mass on a linear spring; example for the engineering map (CC0)"
  parameter Real m(unit="kg") = 1.0 "Mass";
  parameter Real k(unit="N/m") = 100.0 "Spring stiffness";
  Real x(unit="m", start=0.01, fixed=true) "Displacement";
  Real v(unit="m/s", start=0, fixed=true) "Velocity";
equation
  der(x) = v;
  m*der(v) = -k*x;
  annotation(experiment(StopTime=2.0));
end SpringMass;
