// SysML v2 textual notation. Example for the engineering map (CC0).
package BracketExample {
    private import ScalarValues::*;

    part def Bracket {
        attribute massKg : Real;
        attribute material : String;
        port mountingHoles[3];
    }

    part def Frame;

    part assembly {
        part frame : Frame;
        part bracket : Bracket {
            attribute redefines massKg = 0.08;
            attribute redefines material = "6061-T6";
        }
    }
}
