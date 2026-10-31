#!/usr/bin/env node
'use strict';

/*
 * step-to-cadir.cjs — tessellate a neutral CAD B-rep (STEP) into the CADIR
 * tessellation shape the ERP backend's CadirToGlbBuilder already consumes.
 *
 * Why this exists
 * ---------------
 * ACIS SAT carries B-rep geometry only. The installed cadmpeg build can DECODE
 * SAT but has no SAT tessellator and no mesh writer, so it cannot emit a GLB by
 * itself. cadmpeg CAN, however, write a neutral STEP (AP214) from the decoded
 * B-rep. OpenCascade (the OCCT WASM importer this repository already depends on
 * for its in-browser STEP/IGES previews) can then tessellate that STEP.
 *
 *   SAT --cadmpeg--> STEP --occt-import-js--> CADIR tessellations --backend--> GLB
 *
 * This script performs ONLY the middle step: it reads a STEP file with the
 * real OpenCascade kernel and writes a minimal CADIR JSON whose
 * `model.tessellations[]` entries hold exactly the fields
 * `CadirToGlbBuilder.build()` reads (vertices/normals/triangles). It never
 * invents geometry: if the STEP has no tessellatable faces it exits non-zero
 * with a clear reason, and the backend reports the real failure.
 *
 * Security / portability
 * ----------------------
 *   - No shell: the arguments are file paths passed by ProcessBuilder.
 *   - No machine-specific paths: the OCCT module is resolved normally from this
 *     script's location (the repository's node_modules) or, for a packaged
 *     deployment, from the OCCT_IMPORT_JS_MODULE environment variable.
 *
 * Usage:  node step-to-cadir.cjs <step-input> <cadir-output>
 * Exit:   0 success; 2 bad usage/IO; 3 OCCT module missing;
 *         4 OCCT decode failed; 5 no tessellatable geometry.
 */

const fs = require('fs');
const path = require('path');

function fail(code, message) {
  process.stderr.write('step-to-cadir: ' + message + '\n');
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length < 2) {
  fail(2, 'usage: step-to-cadir.cjs <step-input> <cadir-output>');
}
const stepPath = argv[0];
const cadirOut = argv[1];

if (!fs.existsSync(stepPath) || !fs.statSync(stepPath).isFile()) {
  fail(2, 'input file not found: ' + stepPath);
}

// Resolve the OpenCascade WASM importer. Normal Node resolution walks up from
// this file (tools/cad/sat -> repo node_modules), so a checkout works with no
// configuration; a packaged deployment can set OCCT_IMPORT_JS_MODULE to the
// absolute path of the installed occt-import-js package directory.
let occtFactory;
try {
  const override = (process.env.OCCT_IMPORT_JS_MODULE || '').trim();
  occtFactory = require(override ? path.resolve(override) : 'occt-import-js');
} catch (err) {
  fail(3, 'the OpenCascade importer (occt-import-js) could not be loaded: ' + err.message);
}

occtFactory()
  .then((occt) => {
    let result;
    try {
      const buffer = fs.readFileSync(stepPath);
      result = occt.ReadStepFile(new Uint8Array(buffer), null);
    } catch (err) {
      fail(4, 'the OpenCascade importer failed: ' + err.message);
    }

    if (!result || !result.success) {
      fail(4, 'OpenCascade could not read the converted STEP file.');
    }

    const tessellations = [];
    for (const mesh of (result.meshes || [])) {
      const position = mesh && mesh.attributes && mesh.attributes.position
        && mesh.attributes.position.array;
      const index = mesh && mesh.index && mesh.index.array;
      if (!position || !index || position.length < 9 || index.length < 3) {
        continue;
      }
      const vertexCount = Math.floor(position.length / 3);
      const normal = mesh.attributes.normal && mesh.attributes.normal.array;
      const hasNormals = Boolean(normal) && normal.length === position.length;

      const vertices = new Array(vertexCount);
      const normals = hasNormals ? new Array(vertexCount) : null;
      for (let i = 0; i < vertexCount; i += 1) {
        vertices[i] = {
          x: position[i * 3],
          y: position[i * 3 + 1],
          z: position[i * 3 + 2],
        };
        if (hasNormals) {
          normals[i] = {
            x: normal[i * 3],
            y: normal[i * 3 + 1],
            z: normal[i * 3 + 2],
          };
        }
      }

      const triangleCount = Math.floor(index.length / 3);
      const triangles = new Array(triangleCount);
      for (let t = 0; t < triangleCount; t += 1) {
        triangles[t] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
      }

      const tessellation = { vertices, triangles };
      if (hasNormals) {
        tessellation.normals = normals;
      }
      if (mesh.name) {
        tessellation.name = mesh.name;
      }
      tessellations.push(tessellation);
    }

    if (tessellations.length === 0) {
      fail(5, 'the converted STEP file contains no tessellatable geometry.');
    }

    const cadir = { model: { tessellations } };
    fs.writeFileSync(cadirOut, JSON.stringify(cadir));

    const triangles = tessellations.reduce((n, t) => n + t.triangles.length, 0);
    process.stdout.write(
      'tessellated ' + tessellations.length + ' mesh(es), ' + triangles + ' triangle(s)\n',
    );
  })
  .catch((err) => fail(4, 'OpenCascade tessellation failed: ' + (err && err.message)));
