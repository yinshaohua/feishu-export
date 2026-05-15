import assert from 'node:assert/strict';
import { normalizeStructuralBlocks } from '../src/normalize.js';
import type { DocBlock } from '../src/types.js';

function heading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): DocBlock {
  return { type: 'heading', level, text };
}

function paragraph(text: string): DocBlock {
  return { type: 'paragraph', text };
}

function ordered(items: string[]): DocBlock {
  return { type: 'ordered_list', items };
}

function run(): void {
  {
    const input: DocBlock[] = [heading(1, '分享者：411-向东（2025-03-14）')];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [paragraph('分享者：411-向东（2025-03-14）')]);
  }

  {
    const input: DocBlock[] = [
      paragraph('一、如何找优质供应商'),
      paragraph('2、网上找：'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(2, '一、如何找优质供应商'),
      heading(3, '2、网上找：'),
    ]);
  }

  {
    const input: DocBlock[] = [heading(4, '1. 基础参数核查')];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [heading(4, '1． 基础参数核查')]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（一）市场维度'),
      paragraph('1. 市场增长趋势：'),
      paragraph('可以通过分析行业报告来判断。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（一）市场维度'),
      heading(4, '1． 市场增长趋势：'),
      paragraph('可以通过分析行业报告来判断。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（一）市场维度'),
      paragraph('1. 选择刚性市场需求：新手对于市场的敏感度几乎为0，所以在切入某一类目之前，最好选择刚需产品。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（一）市场维度'),
      heading(4, '1． 选择刚性市场需求：'),
      paragraph('新手对于市场的敏感度几乎为0，所以在切入某一类目之前，最好选择刚需产品。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（一）市场维度'),
      paragraph('1. 市场增长趋势：要着重关注市场的增长潜力，选择处于上升期或有潜力增长的市场。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（一）市场维度'),
      heading(4, '1． 市场增长趋势：'),
      paragraph('要着重关注市场的增长潜力，选择处于上升期或有潜力增长的市场。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（二）产品维度'),
      paragraph('1. 产品质量：确保所选产品质量可靠。'),
      paragraph('这里举一个近期发现的产品例子。'),
      paragraph('从评论数可以判断出这个产品表现非常差。'),
      paragraph('如果这个卖家在进行销售之前，进行详细的可行性测试。'),
      paragraph('1. 产品差异化：寻找产品的差异化卖点，以区别于竞争对手的产品。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（二）产品维度'),
      paragraph('1. 产品质量：确保所选产品质量可靠。'),
      paragraph('这里举一个近期发现的产品例子。'),
      paragraph('从评论数可以判断出这个产品表现非常差。'),
      paragraph('如果这个卖家在进行销售之前，进行详细的可行性测试。'),
      heading(4, '1． 产品差异化：'),
      paragraph('寻找产品的差异化卖点，以区别于竞争对手的产品。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（一）市场维度'),
      paragraph('1. 谷歌趋势（https://trends.google.com/trends/）需要梯子；'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（一）市场维度'),
      paragraph('1. 谷歌趋势（https://trends.google.com/trends/）需要梯子；'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（二）产品维度'),
      paragraph('4.1.避免选择需要类目审核的产品；亚马逊部分类目对第三方卖家开放有限制。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（二）产品维度'),
      heading(4, '4.1． 避免选择需要类目审核的产品；'),
      paragraph('亚马逊部分类目对第三方卖家开放有限制。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(3, '（二）产品维度'),
      paragraph('1. 产品的销售资质：'),
      paragraph('4.1.避免选择需要类目审核的产品；'),
      paragraph('亚马逊部分类目对第三方卖家开放有限制。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(3, '（二）产品维度'),
      heading(4, '1． 产品的销售资质：'),
      heading(4, '4.1． 避免选择需要类目审核的产品；'),
      paragraph('亚马逊部分类目对第三方卖家开放有限制。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(4, '1． 专利检索全流程'),
      paragraph('1. 步骤一：确定专利类型：首先确认产品是否属于需要进行外观专利保护的范围。'),
      paragraph('1. 步骤二：进行检索：通过USPTO官网进行检索，查看是否有类似设计的外观专利。'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      heading(4, '1． 专利检索全流程'),
      paragraph('1. 步骤一：确定专利类型：首先确认产品是否属于需要进行外观专利保护的范围。'),
      paragraph('1. 步骤二：进行检索：通过USPTO官网进行检索，查看是否有类似设计的外观专利。'),
    ]);
  }

  {
    const input: DocBlock[] = [
      paragraph('（1）福田会展中心 http://www.szcec.com'),
      paragraph('（2）深圳国际会展中心官网 http://www.shenzhen-world.com'),
      paragraph('（3）广交会官网 https://www.ciff-gz.com'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      ordered([
        '福田会展中心 http://www.szcec.com',
        '深圳国际会展中心官网 http://www.shenzhen-world.com',
        '广交会官网 https://www.ciff-gz.com',
      ]),
    ]);
  }

  {
    const input: DocBlock[] = [
      paragraph('（1）提前做好功课，供方没认真选好，谈判也是徒劳。'),
      paragraph('（2）拜访供方（或者客户），都不要一个人去。'),
      paragraph('（3）不仅仅是我们卖家选供方，有实力的供方同样在挑选客户。'),
      paragraph('（4）会议室内详谈产品现状（产品、包装、价格、交期）'),
      paragraph('（5）参观展览室（可以看证书）'),
      paragraph('（6）参观产线'),
      paragraph('（7）参观仓库'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      ordered([
        '提前做好功课，供方没认真选好，谈判也是徒劳。',
        '拜访供方（或者客户），都不要一个人去。',
        '不仅仅是我们卖家选供方，有实力的供方同样在挑选客户。',
        '会议室内详谈产品现状（产品、包装、价格、交期）',
        '参观展览室（可以看证书）',
        '参观产线',
        '参观仓库',
      ]),
    ]);
  }

  {
    const input: DocBlock[] = [
      heading(4, '（1）提前做好功课，供方没认真选好，谈判也是徒劳。'),
      heading(4, '（2）拜访供方（或者客户），都不要一个人去。'),
      heading(4, '（3）不仅仅是我们卖家选供方，有实力的供方同样在挑选客户。'),
      heading(4, '（4）会议室内详谈产品现状（产品、包装、价格、交期）'),
      heading(4, '（5）参观展览室（可以看证书）'),
      heading(4, '（6）参观产线'),
      heading(3, '（7）参观仓库'),
    ];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [
      ordered([
        '提前做好功课，供方没认真选好，谈判也是徒劳。',
        '拜访供方（或者客户），都不要一个人去。',
        '不仅仅是我们卖家选供方，有实力的供方同样在挑选客户。',
        '会议室内详谈产品现状（产品、包装、价格、交期）',
        '参观展览室（可以看证书）',
        '参观产线',
        '参观仓库',
      ]),
    ]);
  }

  {
    const input: DocBlock[] = [paragraph('（7）参观仓库')];
    const out = normalizeStructuralBlocks(input);
    assert.deepEqual(out, [heading(3, '（7）参观仓库')]);
  }

  console.log('normalizeStructuralBlocks regression checks passed');
}

run();
