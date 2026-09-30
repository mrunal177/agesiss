import { CONFIG } from '../config';
import { Point2D, RegionOfInterest } from '../types';

export interface VirtualCameraState {
  boxOpen: boolean;
  redPos: Point2D;
  yellowPos: Point2D;
  handPos: Point2D;
  handVisible: boolean;
  handDwellMs: number;
  autoPlayActive: boolean;
  autoPlayStep: string;
}

export class VirtualCamera {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;

  private boxROI: RegionOfInterest;
  private targetROI: RegionOfInterest;

  public boxOpen: boolean = false;
  public lidSlideOffset: number = 0; // 0 = closed, 1 = fully slid open
  public showInteractiveOverlayOnLive: boolean = true; // Displays draggable lid & specimens directly on webcam video
  public redPos: Point2D = { x: 130, y: 110 };
  public yellowPos: Point2D = { x: 180, y: 110 };
  public handPos: Point2D = { x: 40, y: 180 };
  public handVisible: boolean = false;
  public handHolding: 'none' | 'red' | 'yellow' = 'none';

  private animTimer: number | null = null;
  private autoPlayTimer: number | null = null;
  public autoPlayActive: boolean = false;
  public autoPlayStep: string = 'Idle';

  // Floating particles for microgravity ambiance
  private particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; alpha: number }> = [];

  constructor(boxROI: RegionOfInterest, targetROI: RegionOfInterest) {
    this.boxROI = boxROI;
    this.targetROI = targetROI;

    this.canvas = document.createElement('canvas');
    this.canvas.width = CONFIG.PROC_W;
    this.canvas.height = CONFIG.PROC_H;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create virtual camera 2D context');
    this.ctx = ctx;

    // Initialize microgravity ambiance particles
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: Math.random() * CONFIG.PROC_W,
        y: Math.random() * CONFIG.PROC_H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }

    this.render();
  }

  public updateROIs(box: RegionOfInterest, target: RegionOfInterest) {
    const dx = box.x - this.boxROI.x;
    const dy = box.y - this.boxROI.y;
    this.boxROI = box;
    this.targetROI = target;

    // If specimens are inside or near the box and not being actively transported elsewhere, move them with the box
    if (this.handHolding !== 'red') {
      this.redPos.x += dx;
      this.redPos.y += dy;
    }
    if (this.handHolding !== 'yellow') {
      this.yellowPos.x += dx;
      this.yellowPos.y += dy;
    }
    this.render();
  }

  public reset() {
    this.stopAutoPlay();
    this.boxOpen = false;
    this.lidSlideOffset = 0;
    this.redPos = { x: this.boxROI.x + 40, y: this.boxROI.y + 50 };
    this.yellowPos = { x: this.boxROI.x + 95, y: this.boxROI.y + 50 };
    this.handPos = { x: 30, y: 190 };
    this.handVisible = false;
    this.handHolding = 'none';
    this.render();
  }

  public toggleBox() {
    return this.setBoxOpen(!this.boxOpen);
  }

  public setBoxOpen(open: boolean) {
    this.boxOpen = open;
    this.lidSlideOffset = open ? 1 : 0;
    this.render();
    return this.boxOpen;
  }

  public setLidSlideOffset(offset: number) {
    this.lidSlideOffset = Math.max(0, Math.min(1, offset));
    if (this.lidSlideOffset >= 0.35 && !this.boxOpen) {
      this.boxOpen = true;
    } else if (this.lidSlideOffset < 0.2 && this.boxOpen) {
      this.boxOpen = false;
    }
    this.render();
  }

  public moveHandTo(target: Point2D, durationMs: number = 600): Promise<void> {
    return new Promise((resolve) => {
      this.handVisible = true;
      const startPos = { ...this.handPos };
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / durationMs);
        // Smooth easeInOut
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;

        this.handPos = {
          x: startPos.x + (target.x - startPos.x) * ease,
          y: startPos.y + (target.y - startPos.y) * ease,
        };

        if (this.handHolding === 'red') {
          this.redPos = { x: this.handPos.x, y: this.handPos.y };
        } else if (this.handHolding === 'yellow') {
          this.yellowPos = { x: this.handPos.x, y: this.handPos.y };
        }

        this.render();

        if (p < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  public async waveHand() {
    this.handVisible = true;
    this.handHolding = 'none';
    const midX = CONFIG.PROC_W / 2;
    const midY = CONFIG.PROC_H / 2;
    await this.moveHandTo({ x: midX - 60, y: midY }, 300);
    await this.moveHandTo({ x: midX + 60, y: midY }, 300);
    await this.moveHandTo({ x: midX - 60, y: midY }, 300);
    await this.moveHandTo({ x: midX + 60, y: midY }, 300);
    await this.moveHandTo({ x: 30, y: 190 }, 400);
    this.handVisible = false;
    this.render();
  }

  public async touchBoxAndRelease() {
    this.handVisible = true;
    this.handHolding = 'none';
    const boxCenter = {
      x: this.boxROI.x + this.boxROI.w / 2,
      y: this.boxROI.y + this.boxROI.h / 2,
    };
    await this.moveHandTo(boxCenter, 400);
    // Dwell for 600ms
    await new Promise((r) => setTimeout(r, 600));
    // Release and retreat
    await this.moveHandTo({ x: 30, y: 190 }, 400);
    this.handVisible = false;
    this.render();
  }

  public async executeStepOpenBox() {
    this.handHolding = 'none';
    const boxLidHandle = {
      x: this.boxROI.x + this.boxROI.w / 2,
      y: this.boxROI.y + 20,
    };
    await this.moveHandTo(boxLidHandle, 400);
    await new Promise((r) => setTimeout(r, 300));
    this.boxOpen = true;
    this.render();
    await new Promise((r) => setTimeout(r, 200));
    await this.moveHandTo({ x: 30, y: 190 }, 400);
    this.handVisible = false;
    this.render();
  }

  public async executeStepPickRed() {
    this.boxOpen = true;
    this.handHolding = 'none';
    await this.moveHandTo(this.redPos, 500);
    // Dwell in contact
    await new Promise((r) => setTimeout(r, 450));
    this.handHolding = 'red';
    // Lift up
    await this.moveHandTo({ x: this.redPos.x, y: this.redPos.y - 30 }, 400);
  }

  public async executeStepPlaceRed() {
    const targetCenter = {
      x: this.targetROI.x + this.targetROI.w / 2,
      y: this.targetROI.y + this.targetROI.h / 2,
    };
    await this.moveHandTo(targetCenter, 600);
    // Hold in target zone for stable frames
    await new Promise((r) => setTimeout(r, 500));
    this.handHolding = 'none';
    // Retract hand
    await this.moveHandTo({ x: 30, y: 190 }, 400);
    this.handVisible = false;
    this.render();
  }

  public async executeStepPickYellow() {
    this.boxOpen = true;
    this.handHolding = 'none';
    await this.moveHandTo(this.yellowPos, 500);
    await new Promise((r) => setTimeout(r, 450));
    this.handHolding = 'yellow';
    await this.moveHandTo({ x: this.yellowPos.x, y: this.yellowPos.y - 30 }, 400);
  }

  public async executeStepPlaceYellow() {
    const targetOffset = {
      x: this.targetROI.x + this.targetROI.w / 2 + 25,
      y: this.targetROI.y + this.targetROI.h / 2,
    };
    await this.moveHandTo(targetOffset, 600);
    await new Promise((r) => setTimeout(r, 500));
    this.handHolding = 'none';
    await this.moveHandTo({ x: 30, y: 190 }, 400);
    this.handVisible = false;
    this.render();
  }

  public async startAutoPlay(onProgress?: (step: string) => void) {
    if (this.autoPlayActive) return;
    this.autoPlayActive = true;

    try {
      this.autoPlayStep = 'Step 1: Open Box';
      onProgress?.(this.autoPlayStep);
      await this.executeStepOpenBox();
      await new Promise((r) => setTimeout(r, 1000));

      if (!this.autoPlayActive) return;
      this.autoPlayStep = 'Step 2: Pick Red Specimen';
      onProgress?.(this.autoPlayStep);
      await this.executeStepPickRed();
      await new Promise((r) => setTimeout(r, 1000));

      if (!this.autoPlayActive) return;
      this.autoPlayStep = 'Step 3: Place Red in Target Zone';
      onProgress?.(this.autoPlayStep);
      await this.executeStepPlaceRed();
      await new Promise((r) => setTimeout(r, 1000));

      if (!this.autoPlayActive) return;
      this.autoPlayStep = 'Step 4: Pick Yellow Reagent';
      onProgress?.(this.autoPlayStep);
      await this.executeStepPickYellow();
      await new Promise((r) => setTimeout(r, 1000));

      if (!this.autoPlayActive) return;
      this.autoPlayStep = 'Step 5: Place Yellow in Target Zone';
      onProgress?.(this.autoPlayStep);
      await this.executeStepPlaceYellow();
      await new Promise((r) => setTimeout(r, 1000));

      this.autoPlayStep = 'Experiment Protocol Complete';
      onProgress?.(this.autoPlayStep);
    } finally {
      this.autoPlayActive = false;
    }
  }

  public stopAutoPlay() {
    this.autoPlayActive = false;
    this.autoPlayStep = 'Idle';
  }

  /**
   * Main Virtual Canvas Render Method
   * Generates realistic space payload imagery
   */
  public render() {
    const ctx = this.ctx;
    const W = CONFIG.PROC_W;
    const H = CONFIG.PROC_H;

    // 1. Payload Rack Deck (realistic aluminum with subtle gradient & grid)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#1a1f2c');
    bgGrad.addColorStop(0.5, '#141824');
    bgGrad.addColorStop(1, '#0e121a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Deck Grid Lines (subtle payload markings)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 20; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Payload Deck Markings
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.font = '7px monospace';
    ctx.fillText('ISRO/NASA BAS BIOLOGY PAYLOAD CASSETTE 01', 12, 14);
    ctx.fillText('MICROGRAVITY HAR VALIDATION DECK', 12, 24);

    // 2. Target Zone Tray (Bottom-Right)
    const tX = this.targetROI.x;
    const tY = this.targetROI.y;
    const tW = this.targetROI.w;
    const tH = this.targetROI.h;

    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(tX, tY, tW, tH);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tX, tY, tW, tH);

    // Tray slot insets
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(tX + 10, tY + 15, 30, 50);
    ctx.fillRect(tX + 55, tY + 15, 30, 50);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(tX + 10, tY + 15, 30, 50);
    ctx.strokeRect(tX + 55, tY + 15, 30, 50);

    ctx.fillStyle = 'rgba(52, 211, 153, 0.5)';
    ctx.font = '6px monospace';
    ctx.fillText('TARGET TRAY', tX + 6, tY + 10);

    // 3. Central Containment Box (inside boxROI)
    const bX = this.boxROI.x;
    const bY = this.boxROI.y;
    const bW = this.boxROI.w;
    const bH = this.boxROI.h;

    // Chamber outer casing
    ctx.fillStyle = '#242b3d';
    ctx.fillRect(bX - 4, bY - 4, bW + 8, bH + 8);
    ctx.strokeStyle = '#38435d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bX - 4, bY - 4, bW + 8, bH + 8);

    // Box Chamber Base Interior & Slots (always visible when lid slides or is open)
    const openGrad = ctx.createLinearGradient(bX, bY, bX, bY + bH);
    openGrad.addColorStop(0, '#4b5563');
    openGrad.addColorStop(0.2, '#64748b');
    openGrad.addColorStop(0.8, '#475569');
    openGrad.addColorStop(1, '#334155');
    ctx.fillStyle = openGrad;
    ctx.fillRect(bX, bY, bW, bH);

    // Interior specimen rack slots
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(bX + 15, bY + 20, 50, 80);
    ctx.fillRect(bX + 85, bY + 20, 50, 80);

    // If lid is not 100% open, render the sliding/hinged lid over the chamber
    const lidSlide = this.boxOpen ? Math.max(0.7, this.lidSlideOffset) : this.lidSlideOffset;
    if (lidSlide < 0.95) {
      ctx.save();
      // Slide lid upwards or to top-left when dragged
      const lidYOffset = -lidSlide * (bH * 0.9);
      const lidXOffset = -lidSlide * 15;
      const curLidY = bY + lidYOffset;
      const curLidX = bX + lidXOffset;

      // Lid shadow if partially slid
      if (lidSlide > 0.05) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(curLidX + 4, curLidY + 6, bW, bH);
      }

      // Dark chamber lid (low mean luminance ~35)
      const lidGrad = ctx.createLinearGradient(curLidX, curLidY, curLidX + bW, curLidY + bH);
      lidGrad.addColorStop(0, '#334155');
      lidGrad.addColorStop(0.5, '#1e293b');
      lidGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = lidGrad;
      ctx.fillRect(curLidX, curLidY, bW, bH);

      // Lid seam & handle latch
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(curLidX + 6, curLidY + 6, bW - 12, bH - 12);

      // Central latch handle (interactive grab target)
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(curLidX + bW / 2 - 32, curLidY + bH / 2 - 10, 64, 20);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(curLidX + bW / 2 - 32, curLidY + bH / 2 - 10, 64, 20);

      // Grip ridges on handle
      ctx.fillStyle = '#ffffff';
      for (let i = -20; i <= 20; i += 8) {
        ctx.fillRect(curLidX + bW / 2 + i - 1, curLidY + bH / 2 - 6, 2, 12);
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲ PINCH OR WAVE TO OPEN LID ▲', curLidX + bW / 2, curLidY + bH / 2 + 24);
      ctx.font = 'bold 7px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('BOX LID HANDLE', curLidX + bW / 2, curLidY + bH / 2 - 14);
      ctx.textAlign = 'start';
      ctx.restore();
    } else {
      // Hinged lid folded open at top
      ctx.fillStyle = '#374151';
      ctx.fillRect(bX, bY - 14, bW, 12);
      ctx.strokeStyle = '#4b5563';
      ctx.strokeRect(bX, bY - 14, bW, 12);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 6px monospace';
      ctx.fillText('CHAMBER OPEN (INTERNAL ILLUMINATION ON)', bX + 6, bY + 12);
    }

    // 4. Biological Specimen Objects (Red Specimen Tube & Yellow Reagent Vial)
    // Draw Red Object
    // Red color: HSV H=0, S=240, V=240 -> RGB(235, 20, 30)
    const rX = this.redPos.x;
    const rY = this.redPos.y;
    const objSize = 22;

    // Specimen tube shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(rX, rY + 3, objSize / 2, objSize / 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Red Specimen Vial
    const redGrad = ctx.createRadialGradient(rX - 3, rY - 3, 2, rX, rY, objSize / 2);
    redGrad.addColorStop(0, '#ff4d4d');
    redGrad.addColorStop(0.7, '#e60000');
    redGrad.addColorStop(1, '#990000');
    ctx.fillStyle = redGrad;
    ctx.beginPath();
    ctx.arc(rX, rY, objSize / 2, 0, Math.PI * 2);
    ctx.fill();

    // White specimen cap/collar
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rX, rY - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // 5. Yellow Reagent Object
    // Yellow color: HSV H=30, S=240, V=240 -> RGB(245, 200, 10)
    const yX = this.yellowPos.x;
    const yY = this.yellowPos.y;

    // Yellow vial shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(yX, yY + 3, objSize / 2, objSize / 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Yellow Reagent Vial
    const yellowGrad = ctx.createRadialGradient(yX - 3, yY - 3, 2, yX, yY, objSize / 2);
    yellowGrad.addColorStop(0, '#ffea4d');
    yellowGrad.addColorStop(0.7, '#eab308');
    yellowGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = yellowGrad;
    ctx.beginPath();
    ctx.arc(yX, yY, objSize / 2, 0, Math.PI * 2);
    ctx.fill();

    // Black/grey cap
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.arc(yX, yY - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // 6. Microgravity ambient floating particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      ctx.fillStyle = `rgba(200, 220, 255, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Astronaut Gloved Hand (if visible)
    if (this.handVisible) {
      const hX = this.handPos.x;
      const hY = this.handPos.y;

      // Forearm sleeve
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hX - 25, hY + 40);
      ctx.lineTo(hX - 10, hY + 15);
      ctx.stroke();

      // Wrist thermal ring
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hX - 18, hY + 22);
      ctx.lineTo(hX - 4, hY + 12);
      ctx.stroke();

      // Palm
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(hX, hY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fingers
      const drawFinger = (fx: number, fy: number, r: number) => {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(fx, fy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      drawFinger(hX + 11, hY - 6, 4.5); // Index
      drawFinger(hX + 8, hY - 12, 4);   // Middle
      drawFinger(hX - 1, hY - 14, 4);   // Ring
      drawFinger(hX + 12, hY + 5, 4.5);  // Thumb
    }
  }
}
