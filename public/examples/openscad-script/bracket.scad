// L-bracket, 60 x 40 x 40 mm, 6 mm plate: the site's test part as an OpenSCAD script.
// Units are millimeters. Example for the engineering map, CC0.
plate = 6;      // plate thickness
w = 60;         // width (x)
d = 40;         // depth of the base (y)
h = 40;         // height of the upright (z)

difference() {
    union() {
        cube([w, d, plate]);              // base plate
        cube([w, plate, h]);              // upright plate
    }
    // two 6.5 mm holes through the base
    for (x = [15, 45])
        translate([x, d - 12, -1]) cylinder(d = 6.5, h = plate + 2, $fn = 48);
    // one 8 mm hole through the upright
    translate([w / 2, -1, h - 14]) rotate([-90, 0, 0]) cylinder(d = 8, h = plate + 2, $fn = 48);
}
