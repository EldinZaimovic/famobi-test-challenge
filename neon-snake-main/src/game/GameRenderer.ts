import Phaser from 'phaser';

// The platform/controller own pause decisions. Override Phaser's automatic
// loop controls without removing visibility listeners belonging to other systems.
export class GameRenderer extends Phaser.Game {
  protected override onHidden(): void {}
  protected override onVisible(): void {}
  protected override onBlur(): void {}
  protected override onFocus(): void {}
}
