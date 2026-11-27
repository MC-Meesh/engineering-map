#!/usr/bin/env python3
"""Fetch the third-party example files we may redistribute, with their license texts, into
public/examples/<format>/, and write data/examples/third-party.yaml (size, sha256, license,
attribution, source). Each repository's license is read from the GitHub API (`gh`) and must
match the expected SPDX id, or the file is skipped. Policy: docs/decisions/0005-format-examples.md.

Run from the repo root:  python3 scripts/fetch_examples.py
"""
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

import yaml

ROOT = os.getcwd()
TODAY = os.environ.get("EXAMPLES_DATE", "2026-11-21")
RAW = "https://raw.githubusercontent.com"

# format, repo, branch, path in repo, expected SPDX, attribution, contains, note
SOURCES = [
    ("ansys-cdb", "ansys/pymapdl-reader", "main", "ansys/mapdl/reader/examples/HexBeam.cdb", "MIT",
     "ANSYS, Inc. (ansys/pymapdl-reader)",
     "A small hexahedral beam mesh in Mechanical APDL blocked CDB form, shipped as a reader test example.", None),
    ("parasolid-xt", "ansys/example-data", "main", "pymechanical/embedding/LONGBAR.x_t", "MIT",
     "ANSYS, Inc. (ansys/example-data)",
     "A text Parasolid transmit file of a long bar, written by SolidWorks 98Plus (Parasolid 10.0).",
     "The format is Siemens' and proprietary; this file is published by Ansys under MIT."),
    ("acis-sat", "ansys/example-data", "main", "pyaedt/mri/implant_rod.sat", "MIT",
     "ANSYS, Inc. (ansys/example-data)",
     "A small ACIS text SAT body of a rod, used in a PyAEDT MRI example.",
     "The format is Spatial's and proprietary; this file is published by Ansys under MIT."),
    ("lsdyna-k", "ansys/example-data", "main", "pydpf-composites/lsdyna_bird_strike/input.k", "MIT",
     "ANSYS, Inc. (ansys/example-data)",
     "A complete LS-DYNA keyword deck: an SPH bird striking a composite shell plate, with parts, composite materials, an equation of state, initial velocity and output cards.", None),
    ("fluent-cas", "ansys/example-data", "main", "pyfluent/2d_box/pro_species.cas", "MIT",
     "ANSYS, Inc. (ansys/example-data)",
     "A small legacy text Fluent case (Fluent 23.1) for a 2D species transport box; no data file.", None),
    ("nastran-op2", "SteveDoyle2/pyNastran", "main", "models/solid_bending/solid_bending.op2", "BSD-3-Clause",
     "Steven Doyle and pyNastran contributors",
     "Binary OP2 results of a small solid-element bending model (pyNastran test model).", None),
    ("qif", "QualityInformationFramework/qif-community", "master", "samples/NISTmodels/nist_ctc_01_asme1_ap242.qif", "BSL-1.0",
     "QIF community (Digital Metrology Standards Consortium); model from NIST PMI test case CTC 01",
     "QIF model-based definition of NIST combined test case 1: product geometry references and semantic PMI.", None),
    ("reqif", "strictdoc-project/reqif", "main", "tests/integration/commands/dump/01_basic_example/sample.reqif", "Apache-2.0",
     "strictdoc-project/reqif contributors",
     "A minimal valid ReqIF document: datatype and spec object type definitions, one requirement and one specification tree.",
     "A test fixture, not an export from a requirements tool."),
    ("ifc", "buildingSMART/Certification-datasets", "main", "IFC 4.0.2.1 (IFC 4 ADD2 TC1)/Simple-Scene/Building-Architecture.ifc", "CC-BY-4.0",
     "buildingSMART International Ltd. (Certification-datasets, CC BY 4.0)",
     "A small IFC4 architectural building model from the buildingSMART certification datasets.", None),
    ("lef-def", "The-OpenROAD-Project/OpenROAD", "master", "openroad/drt/test/gcd_sky130hd.def", "BSD-3-Clause",
     "The OpenROAD Project",
     "DEF placement and routing data of the small GCD design on the SkyWater 130 nm HD cell library.", None),
]


def gh(path):
    return json.loads(subprocess.run(["gh", "api", path], check=True, capture_output=True, text=True).stdout)


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "engineering-map"}), timeout=60) as r:
        return r.read()


# GitHub cannot classify these license files; each was read by hand on 2026-11-21 and matches
# the expected license (pyNastran BSD-3-Clause text, QIF Boost 1.0, buildingSMART CC BY 4.0).
READ_BY_HAND = {"SteveDoyle2/pyNastran", "QualityInformationFramework/qif-community", "buildingSMART/Certification-datasets"}
entries = []
for fmt, repo, branch, rpath, spdx, attribution, contains, note in SOURCES:
    lic = gh("repos/%s/license" % repo)
    got = (lic.get("license") or {}).get("spdx_id")
    if got != spdx and not (got == "NOASSERTION" and repo in READ_BY_HAND):
        print("SKIP %s: %s license is %s, expected %s" % (fmt, repo, got, spdx))
        continue
    url = "%s/%s/%s/%s" % (RAW, repo, branch, urllib.request.quote(rpath))
    try:
        data = get(url)
    except Exception as exc:  # moved file: try the alternative path the agent gave
        print("SKIP %s: %s (%s)" % (fmt, url, exc))
        continue
    if data.startswith(b"version https://git-lfs"):
        print("SKIP %s: Git LFS pointer" % fmt)
        continue
    if len(data) > 5e6:
        print("SKIP %s: %d bytes" % (fmt, len(data)))
        continue
    name = os.path.basename(rpath)
    d = os.path.join(ROOT, "public", "examples", fmt)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name), "wb") as fh:
        fh.write(data)
    lic_text = get(lic["download_url"])
    lic_name = name + ".LICENSE.txt"
    with open(os.path.join(d, lic_name), "wb") as fh:
        fh.write(("License of %s (%s), from https://github.com/%s\n\n" % (name, spdx, repo)).encode() + lic_text)
    e = {
        "format": fmt,
        "file": "examples/%s/%s" % (fmt, name),
        "contains": contains,
        "origin": "third-party",
        "license": spdx,
        "attribution": "%s. License text: %s." % (attribution, lic_name),
        "source_url": "https://github.com/%s/blob/%s/%s" % (repo, branch, urllib.request.quote(rpath)),
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "as_of": TODAY,
    }
    if note:
        e["note"] = note
    entries.append(e)
    print("%-13s %-45s %8d %s" % (fmt, name, len(data), spdx))

with open(os.path.join(ROOT, "data", "examples", "third-party.yaml"), "w") as fh:
    fh.write("# Generated by scripts/fetch_examples.py. Third-party files redistributed under their licenses.\n")
    yaml.safe_dump({"examples": entries}, fh, sort_keys=False, width=100)
print("%d files, %.2f MB" % (len(entries), sum(e["size"] for e in entries) / 1e6))
