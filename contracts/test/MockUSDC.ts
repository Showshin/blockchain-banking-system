import { expect } from "chai";
import { network } from "hardhat";
import type { Contract } from "ethers";
import { USDC, withSigner } from "./fixtures.ts";

const { ethers } = await network.create();

describe("MockUSDC", function () {
  it("uses six decimals and lets any test account mint", async function () {
    const token = (await ethers.deployContract("MockUSDC")) as unknown as Contract;
    const [, recipient] = await ethers.getSigners();

    expect(await token.decimals()).to.equal(6);
    expect(await token.symbol()).to.equal("USDC");

    await expect(withSigner(token, recipient).mint(recipient.address, USDC(25)))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, recipient.address, USDC(25));

    expect(await token.balanceOf(recipient.address)).to.equal(USDC(25));
  });
});
