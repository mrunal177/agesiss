import { ProtocolConfig } from '../types';

export const PRIMARY_PROTOCOL: ProtocolConfig = {
  id: 'protocol-bas-01',
  name: 'Space Biology Payload: Object Transfer Protocol',
  description: 'Standard protocol for biological specimen & reagent container transfer in microgravity rack.',
  steps: [
    {
      id: 1,
      name: 'OPEN_BOX',
      type: 'OPEN',
      object: 'box',
      voice: 'Please open the box.',
      hint: 'Drag on-screen Box Lid up, wave hand across cyan Box Region, or click "Open Box Now"',
    },
    {
      id: 2,
      name: 'PICK_RED',
      type: 'PICK',
      object: 'red',
      voice: 'Please pick the red object.',
      hint: 'Drag the on-screen Red specimen vial, or reach into chamber with your hand',
    },
    {
      id: 3,
      name: 'PLACE_RED',
      type: 'PLACE',
      object: 'red',
      voice: 'Please place the red object in the target zone.',
      hint: 'Drag on-screen Red specimen into the green Target Zone (bottom-right)',
    },
    {
      id: 4,
      name: 'PICK_YELLOW',
      type: 'PICK',
      object: 'yellow',
      voice: 'Please pick the yellow object.',
      hint: 'Drag the on-screen Yellow reagent vial, or reach into chamber with your hand',
    },
    {
      id: 5,
      name: 'PLACE_YELLOW',
      type: 'PLACE',
      object: 'yellow',
      voice: 'Please place the yellow object in the target zone.',
      hint: 'Drag on-screen Yellow vial to the green Target Zone and release',
    },
  ],
  preconditions: [
    'Box closed',
    'Red and yellow inside box',
    'Target zone empty',
  ],
  postconditions: [
    'Box open',
    'Red and yellow in TARGET_ZONE',
  ],
};

export const ALTERNATE_PROTOCOL: ProtocolConfig = {
  id: 'protocol-seedling-02',
  name: 'Plant Seedling Growth Chamber Protocol (4-Step Scalability)',
  description: 'Compressed 4-step experiment verification cycle for automated botanical germination monitoring.',
  steps: [
    {
      id: 1,
      name: 'OPEN_BOX',
      type: 'OPEN',
      object: 'box',
      voice: 'Please open the box.',
      hint: 'Wave hand across cyan Box Region, show open palm, or click "Open Box Now"',
    },
    {
      id: 2,
      name: 'PICK_RED',
      type: 'PICK',
      object: 'red',
      voice: 'Please pick the red object.',
      hint: 'Pick the red specimen from inside the chamber',
    },
    {
      id: 3,
      name: 'PLACE_RED',
      type: 'PLACE',
      object: 'red',
      voice: 'Please place the red object in the target zone.',
      hint: 'Place red specimen in green target zone',
    },
    {
      id: 4,
      name: 'PICK_YELLOW',
      type: 'PICK',
      object: 'yellow',
      voice: 'Please pick the yellow object.',
      hint: 'Pick yellow specimen from inside the chamber',
    },
  ],
  preconditions: [
    'Box closed',
    'Red and yellow inside box',
    'Target zone empty',
  ],
  postconditions: [
    'Box open',
    'Red in TARGET_ZONE',
    'Yellow picked',
  ],
};
