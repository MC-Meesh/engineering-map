; 3D printing G-code for a small 20 x 20 mm square, two layers (FDM, 0.4 mm nozzle).
; Example for the engineering map, CC0. Illustrative only: slicers add many more moves.
M140 S60 ; heat the bed to 60 C
M104 S210 ; heat the nozzle to 210 C
M190 S60 ; wait for the bed
M109 S210 ; wait for the nozzle
G21 ; millimeters
G90 ; absolute positions
M82 ; absolute extrusion
G28 ; home all axes
G92 E0 ; reset the extruder position
;LAYER:0
G1 Z0.2 F1200 ; first layer height
G0 X100 Y100 F6000
G1 X120 Y100 E0.8 F1200 ; extrude plastic along one side
G1 X120 Y120 E1.6
G1 X100 Y120 E2.4
G1 X100 Y100 E3.2
;LAYER:1
G1 Z0.4 F1200
G1 X120 Y100 E4.0
G1 X120 Y120 E4.8
G1 X100 Y120 E5.6
G1 X100 Y100 E6.4
G1 E5.6 F2400 ; retract a little filament
M104 S0 ; nozzle heater off
M140 S0 ; bed heater off
G28 X0 ; move the head out of the way
M84 ; motors off
