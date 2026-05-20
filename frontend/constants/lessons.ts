export type LessonSection = {
    heading: string;
    body: string;
};

export type Lesson = {
    id: number;
    title: string;
    description: string;
    passage: string;
    passageRef: string;
    sections: LessonSection[];
    prayer: string;
};

export const LESSONS: Lesson[] = [
    {
        id: 1,
        title: 'Saving for the Unexpected',
        description: 'Discover what Proverbs teaches us about wise preparation and why building a financial cushion is an act of stewardship, not fear.',
        passage: '"The wise store up choice food and olive oil, but fools gulp theirs down."',
        passageRef: 'Proverbs 21:20 (NIV)',
        sections: [
            {
                heading: 'The Fool and the Wise',
                body: 'Proverbs contrasts two types of people: those who consume everything they have the moment they receive it, and those who intentionally set some aside. The "fool" here is not someone lacking intelligence — they are someone who lacks the discipline to think beyond today. Saving is not a sign of distrust in God; it is a recognition that He has entrusted us with resources to manage wisely over time.',
            },
            {
                heading: 'An Emergency Fund Is an Act of Wisdom',
                body: 'Life brings unexpected costs — a car repair, a medical bill, a job transition. When we have nothing saved, these moments force us into debt or panic. Building even a small emergency fund (3–6 months of expenses) means we are not caught off guard. We honor God by being prepared stewards, not reactive ones.',
            },
        ],
        prayer: 'Lord, give me the discipline to set aside what You provide rather than consuming it all. Help me to plan wisely, trust in Your provision, and build a foundation that can weather the storms of life. May my savings be a reflection of my stewardship and not my anxiety. Amen.',
    },
    {
        id: 2,
        title: 'Planning for the Future',
        description: 'Jesus uses the example of a tower builder to show us that counting the cost — financial and otherwise — is a mark of wisdom.',
        passage: '"Suppose one of you wants to build a tower. Won\'t you first sit down and estimate the cost to see if you have enough money to complete it? For if you lay the foundation and are not able to finish it, everyone who sees it will ridicule you, saying, \'This person began to build and wasn\'t able to finish.\'"',
        passageRef: 'Luke 14:28–30 (NIV)',
        sections: [
            {
                heading: 'Count the Cost',
                body: 'Jesus told this parable in the context of discipleship, but the financial principle is clear: starting something without planning is foolish. Budgeting is simply "counting the cost" in your own life. Whether you are saving for a home, planning for retirement, or setting goals for the year, taking the time to estimate, plan, and commit is an act of wisdom that Scripture affirms.',
            },
            {
                heading: 'Goals Give Direction to Your Money',
                body: 'Without a plan, money drifts. With a plan — even a simple one — your spending and saving become intentional. The 50/30/20 framework is a practical way to structure your resources so that your needs are covered, your wants are enjoyed in proportion, and your future is being built. Planning is not a lack of faith; it is faith in action.',
            },
        ],
        prayer: 'Father, teach me to be a thoughtful planner. Help me not to spend impulsively or ignore the future. Give me vision for where You are leading me, and the wisdom to align my finances with that direction. I trust that as I plan, You will guide my steps. Amen.',
    },
    {
        id: 3,
        title: 'Using Money for God\'s Kingdom',
        description: 'Matthew 6 challenges us to rethink what we treasure — and how our financial choices reveal where our heart truly is.',
        passage: '"Do not store up for yourselves treasures on earth, where moths and vermin destroy, and where thieves break in and steal. But store up for yourselves treasures in heaven, where moths and vermin do not destroy, and where thieves do not break in and steal. For where your treasure is, there your heart will be also."',
        passageRef: 'Matthew 6:19–21 (NIV)',
        sections: [
            {
                heading: 'Earthly vs. Eternal Treasure',
                body: 'Jesus is not saying money is evil or that saving is wrong. He is speaking to our attachment — to the posture of our heart toward our wealth. Earthly treasure is temporary by nature; it can be lost, stolen, or worn away. Eternal treasure — investing in people, in the Gospel, in generosity — cannot be taken from you. The question is not how much you have, but where your allegiance lies.',
            },
            {
                heading: 'Generosity as an Act of Worship',
                body: 'When we give — to our local church, to those in need, to Kingdom causes — we are making a declaration: "This is not ultimately mine." Generosity loosens the grip that money can have on our hearts. Even modest, faithful giving trains us to hold wealth loosely and to trust God as our true provider. Your budget is a spiritual document. How much flows toward God\'s purposes tells the story of your priorities.',
            },
        ],
        prayer: 'Jesus, You gave everything for me. Help me to hold my finances with open hands. Show me where I am placing security in wealth rather than in You. Give me a generous heart — not out of obligation, but out of overflow — and let my spending reflect that You are my greatest treasure. Amen.',
    },
];
