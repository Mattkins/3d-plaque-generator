#!/usr/bin/env node

/*

TODO & Notes

- Need to add a print-in-place cleat with supports
  - Customer could leave the cleat in place and use as-is or snap it off and mount with it
  - Optional though-holes for mounting with screws in the corners
  - What's the best cleat thickness?
  - Flat inset to accommodate flat-head drywall anchor screws with taper to accommodate tapered wood screws
  - What's the best size for the supports?
  - What's the best spacing for the supports? ideal bridge length for my printer.



*/



/**
 * Usage:
 *   node index.js "<QR_DATA_URL>" [IMAGE_ABSOLUTE_PATH] [LETTERING]
 *
 * Example:
 *   node index.js "https://example.com" "/path/to/logo.svg" "Reserve Conference Room"
 */

const fs = require('fs')
const path = require('path')

// import the deserializer
const { deserializer } = require('@jscad/svg-deserializer')
// import the extrude primitive from JSCAD
const { extrudeLinear } = require('@jscad/modeling').extrusions


async function main() {
  // Import the qr-code-styling library. Note that this library is primarily built for the browser,
  // so if running in Node you may need to set up a headless-canvas or similar environment.
  const QRCodeStyling = require('qr-code-styling')

  // Import JSCAD modeling and IO libraries
  const { cuboid, union, subtract, translate, extrudeLinear } = require('@jscad/modeling').primitives
  const { text } = require('@jscad/modeling').text // JSCAD text function you may need a font installed
  const { serialize } = require('@jscad/io').stlSerializer

  // Parse command line arguments
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.log('Usage: node index.js "<QR_DATA_URL>" [IMAGE_ABSOLUTE_PATH] [LETTERING]')
    process.exit(1)
  }
  const qrData = args[0]
  const imagePath = args[1] || null
  const lettering = args[2] || null

  // Plaque dimensions and parameters (all dimensions in mm)
  let plaqueWidth = 160
  let plaqueHeight = lettering ? 175 : 160 // If no lettering, use a square plaque
  const plaqueThickness = 6.48
  const qrMargin = 8
  const qrExtrudeHeight = 1.62
  const borderWidth = 3
  const borderExtrudeHeight = 1.62

  // Calculate the QR code size (width equals plaque width minus left/right margins)
  const qrSize = plaqueWidth - 2 * qrMargin

  // --- Create the plaque base ---
  const plaque = cuboid({ size: [plaqueWidth, plaqueHeight, plaqueThickness] })

  // --- Create the border ---
  // We create a frame by subtracting an inner rectangle from an outer one (both extruded)
  const outerBorder = cuboid({ size: [plaqueWidth, plaqueHeight, borderExtrudeHeight] })
  const innerWidth = plaqueWidth - 2 * borderWidth
  const innerHeight = plaqueHeight - 2 * borderWidth
  const innerBorder = translate([borderWidth, borderWidth, 0], cuboid({ size: [innerWidth, innerHeight, borderExtrudeHeight] }))
  const border = subtract(outerBorder, innerBorder)

  // --- Set up the QR code generation using qr-code-styling ---
  const qrCode = new QRCodeStyling({
    width: qrSize,
    height: qrSize,
    data: qrData,
    image: imagePath ? imagePath : undefined, // if an image is provided, qr-code-styling will embed it
    qrOptions: {
      errorCorrectionLevel: 'M'
    },
    dotsOptions: {
      // Options for dot style "rounded" produces rounded corners
      type: 'rounded'
    },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 8 // Ensure a 8mm margin between the embedded image and the QR dots
    }
  })


  try {
    const svgString = await qrCode.getRawData('svg') 
    const extrudeHeight = 1.62  // mm
  
    const qr3D = await svgToExtrudedGeometry(svgString, extrudeHeight)
  
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }

  // --- Position the QR code on the plaque ---
  // Centered horizontally with 8mm margins on the left/right,
  // and with a 8mm top margin.
  // Since our QR code is a square of size `qrSize`, we can position it as follows:
  const qrPosX = qrMargin
  // For Y: we want the top edge of the QR code to be at plaqueHeight - qrMargin.
  // Therefore, translate the QR code so its center is qrSize/2 below that.
  const qrPosY = plaqueHeight - qrMargin - (qrSize / 2)
  // Place it on top of the plaque.
  const positionedQR = translate([qrPosX, qrPosY - (qrSize / 2), plaqueThickness], qr3D)

  // --- Create the lettering (if provided) ---
  let lettering3D = null
  if (lettering) {
    // Create 2D text geometry.
    // Adjust font, size, and kerning as needed.
    // Note: the 'text' function may require a path to a font file or use a default.
    const lettering2D = text({ text: lettering, font: 'Sans', size: 10, kerning: 0.6 })
    // Extrude the text up 1.62mm.
    lettering3D = extrudeLinear({ height: qrExtrudeHeight }, lettering2D)
    // Position the lettering 9mm below the bottom of the QR code.
    const letteringPosY = qrPosY - (qrSize / 2) - 9 - 5 // '5' is an approximate half-height of the text adjust as needed
    // Center the text horizontally (assumes the text geometry is centered you may need to translate based on bounding box)
    const letteringPosX = plaqueWidth / 2
    lettering3D = translate([letteringPosX, letteringPosY, plaqueThickness], lettering3D)
  }

  // --- Combine all parts of the design ---
  // Raise the border so it sits on top of the plaque.
  const raisedBorder = translate([0, 0, plaqueThickness], border)
  let finalModel = union(plaque, raisedBorder, positionedQR)
  if (lettering3D) {
    finalModel = union(finalModel, lettering3D)
  }

  // --- Export the model to STL ---
  const stlData = serialize({ binary: false }, finalModel)
  const outputPath = path.join(process.cwd(), 'plaque.stl')
  fs.writeFileSync(outputPath, stlData)
  console.log('STL file generated at:', outputPath)
}

async function svgToExtrudedGeometry(svgString, extrudeHeight) {
  // deserialize into an array of geometries (default target is 'geom2')
  // you can pass options like pixels-per-mm (pxPmm) if your SVG units aren't mm
  const geometries = deserializer.deserialize(
    {
      output: 'geometry',   // get actual geometry objects
      target: 'geom2',      // 2D geometry
      pxPmm: 1,             // 1px = 1mm (adjust if needed)
      segments: 32          // resolution for circles/curves
    },
    svgString
  )

  // extrude each geom2 up to make it 3D
  const extruded = geometries.map((geom2) =>
    extrudeLinear({ height: extrudeHeight }, geom2)
  )

  // combine all extrusions into one CSG for export
  // (you could also union them with @jscad/modeling.booleans.union)
  return extruded
}

main().catch(console.error)